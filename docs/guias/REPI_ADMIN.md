# REPI Admin — Dar de alta y administrar un cliente

Entrada: `/admin`, con una cuenta personal autorizada y la verificación en dos pasos requerida. Las cuentas históricas de demostración no son cuentas operativas. La creación o recuperación del primer Admin debe seguir el procedimiento seguro vigente; esta guía no incluye credenciales.

## Antes de crear el cliente

- [ ] Confirmar gym o coach, nombre visible y razón social real.
- [ ] Confirmar nombre y email del responsable que recibirá la invitación.
- [ ] Definir organización completa o sedes incluidas, evitando contar dos veces a la misma persona.
- [ ] Acordar qué cuenta como socio/alumno vigente y el total inicial.
- [ ] Acordar precio por unidad, moneda y fecha de efecto.
- [ ] Guardar el alcance y la aceptación externa con una referencia localizable.
- [ ] Completar el circuito de pago, soporte y condiciones aplicables por el canal acordado. La pantalla no los inventa.

No es necesario cargar un padrón de todos los socios para configurar la cantidad comercial.

## Crear, habilitar e invitar

1. Abrí **Clientes → Nuevo cliente**. Completá tipo, nombre visible, razón social, moneda, responsable y email. Para gym, cargá las sedes separadas por coma y el alcance.
2. Usá **Crear borrador**. El borrador no equivale a un cliente operativo.
3. En **Cantidad y precio**, cargá **Nueva cantidad** y **Nuevo precio**. Son dos versiones independientes: cada una lleva fecha de efecto, motivo y evidencia si corresponde.
4. En **Acuerdo y habilitación**, registrá referencia, fecha y versión de la aceptación ya realizada por fuera de la app. **Registrar aceptación** no sustituye la firma o aceptación externa.
5. Usá **Habilitar cliente**. Dejá la fecha de prueba vacía salvo que exista una prueba sin cargo expresamente acordada.
6. En **Invitación de bienvenida**, verificá nuevamente el destinatario y elegí **Enviar invitación**. El responsable crea sus credenciales; no le envíes una contraseña escrita por vos.
7. Comprobá que pudo aceptar y que ve el espacio correcto. La bienvenida vence a los siete días. **Reenviar** invalida la anterior; **Revocar** la deja sin efecto.

**Cambiar responsable** actualiza el destinatario y revoca invitaciones vigentes. No asumir que eso por sí solo transfiere todos los roles existentes: revisar el acceso anterior y el nuevo conforme al procedimiento de operación.

## Qué se cobra y qué se observa

| Dato | Significado |
| --- | --- |
| Cantidad acordada gym | Todos los socios incluidos en el acuerdo, usen o no la app. |
| Cantidad acordada coach | Todos sus alumnos vigentes acordados, hayan o no activado REPI. |
| Precio por unidad | Importe negociado específicamente con ese cliente. |
| Accesos habilitados | Adopción del servicio; no reemplaza la cantidad comercial. |
| Supera lo acordado | Aviso para revisar con el cliente; no genera cargo ni bloqueo automático. |

## Renegociar o actualizar cantidades

1. Abrí **Clientes → cliente → Nueva cantidad** o **Nuevo precio**.
2. Cargá el nuevo valor y fecha de efecto acordada. Explicá el motivo y guardá la evidencia pertinente.
3. Revisá la tabla de versiones y la vista previa del período.
4. Confirmá con el responsable que **Condiciones REPI** refleja lo pactado.

No borrar versiones para corregir un acuerdo ni reescribir cierres históricos. No inferir prorrateos, descuentos, mora o impuestos. Si hay cambios dentro de un período que el cálculo no puede resolver, tratar la diferencia como una decisión pendiente, no forzar un total.

## Vista previa y cierres

En la base revisada, **Cierre simulado del período** guarda una referencia de cantidad, precio y subtotal. **No cobra, no confirma una transferencia y no emite una factura fiscal**. No usarlo como recibo ni llenar «Cobrado» con una estimación.

El registro manual de pagos del coach a sus alumnos es otro módulo. No se usa para registrar la suscripción que el coach o el gym paga a REPI.

## Contactos, privacidad y controles de operación

- **Contactos:** son interesados que completaron el formulario comercial. Marcar un contacto no crea por sí mismo un acuerdo aceptado. Si se abrió el formulario y no se terminó el alta, revisar el estado del contacto.
- **Privacidad:** registrar y tramitar pedidos con el [procedimiento específico](../PRIVACIDAD_OPERACION.md). «Registrar como resuelto» documenta el resultado; no ejecuta automáticamente el borrado.
- **Resumen:** revisar clientes por habilitar, diferencias de cantidad, pedidos de privacidad y señales de fallos. Un contador no reemplaza investigar el caso.
- **Suspender:** la interfaz revisada informa que impide nuevas altas. No usarlo como mecanismo automático de mora ni prometer que corta todas las funciones existentes sin verificar su alcance.

## Verificación al terminar un alta

- [ ] Responsable aceptó con su email correcto y completó su seguridad de acceso.
- [ ] Organización, sedes y rol coinciden con el acuerdo.
- [ ] Cantidad y precio visibles son los pactados, con fecha correcta.
- [ ] Se probó una invitación o solicitud de acceso y su resolución.
- [ ] El cliente recibió su guía y conoce quién mantiene las bajas.
- [ ] Canal de soporte y responsable operativo quedaron acordados.
