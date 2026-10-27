# REPI — Qué se puede ofrecer y qué falta confirmar

Revisión documental y de código: 27/10/2026, tomando como base `cf124b1` y decisiones hasta D86. Hay desarrollo posterior en curso: esta hoja se actualiza con evidencia, no por expectativa. No se ejecutaron pruebas de producción para redactar este paquete.

## Cómo leer el estado

- **Presente en código:** existe una interfaz y un servicio para la capacidad indicada.
- **Reportado en el checkpoint:** el desarrollo anterior dejó una verificación; no es una nueva prueba de esta revisión.
- **Pendiente de verificación operativa:** hace falta probar el recorrido en el despliegue y dispositivos que usarán los clientes.
- **Futuro o parcial:** no se ofrece como incluido por el solo hecho de aparecer en un menú, un prototipo o el roadmap.

## Capacidades observadas

| Área | Lo que existe en la base revisada | Límite a explicar |
| --- | --- | --- |
| Demo comercial | Cuatro perfiles, entorno ficticio separado por visita, guía sobre pantallas reales. | La guía no valida que cada acción sugerida se complete. La purga a seis horas depende del job. |
| Alta comercial | Admin crea borrador, registra aceptación externa, habilita e invita al responsable. | No hay alta comercial libre ni prueba gratuita automática. No enviar una contraseña creada por el administrador. |
| Alta gym | QR por sede, identidad verificada, solicitud y decisión compartida por personal autorizado. | El gimnasio debe comprobar pertenencia y mantener bajas; no hay conexión automática con el cobro de la cuota. |
| Entrenamiento | Programa, sesión, series, carga fina, RIR, RPE, descanso, resumen e historial; cola local. | Offline se limita al núcleo preparado en el teléfono. No toda la app funciona sin red. |
| Coach | Clientes, programas, pedidos, chat, rendimiento y registro manual de cobros. | Algunas pestañas del producto completo son parciales. No ofrecer calendario, importación o informes futuros como terminados. |
| Gym | Turnos, tareas, traspasos, accesos, indicadores, novedades y desafíos. | Los permisos varían por rol/sede. Push aceptado por proveedor no significa recibido o leído. |
| Comunidad | Participación voluntaria, publicaciones, evolución elegida, comentarios, reacciones y moderación del gym. | El ámbito revisado es gym. No usar sesiones privadas del coach como fuente pública. Comunidad independiente del coach pendiente. |
| Suscripción REPI | Cantidad y tarifa versionadas, condiciones visibles y vista previa del período. | Los cierres revisados son simulados; no implican pago, factura fiscal ni conciliación bancaria. |
| Cobros coach | Cargos, registro de pago completo y anulaciones con motivo. | Sin procesamiento de dinero; pagos parciales y automatizaciones no confirmados en esta base. |
| Privacidad | Permisos, exportación JSON y pedidos de eliminación en Admin. | Pedir o marcar un pedido no ejecuta por sí solo todo el borrado. La exportación no adjunta todos los archivos. |
| Instalación | Guía adaptada a plataforma y ayuda en `/instalar`. | D82: sin continuar navegador en la guía móvil. Instalación/apertura/push necesitan comprobación en teléfonos reales. |
| Correo y archivos | D83 reporta storage privado probado; D86 reporta Resend y dominio configurados. | Configuración no garantiza cada envío. Deben verificarse alta, recuperación e invitación en la versión que se entrega. |

## Condiciones antes de activar clientes reales

1. **Acceso administrativo personal:** al inicio de la revisión de continuidad, el operador principal confirmó que la base hospedada sólo tenía cuentas de demostración y cero administradores. La creación segura del primer Admin está en curso. No usar las cuentas demo históricas para operar clientes.
2. **Separación demo/operación real:** el último checkpoint publicado conserva `REPI_DEPLOY=demo`, con copia de correos en buzón de desarrollo. Confirmar la configuración final antes de datos reales.
3. **Hosting comercial y continuidad:** confirmar el plan contratado y su aptitud para la operación, copias de seguridad, restauración y responsable de incidentes. No presentar la existencia de una base hospedada como prueba de recuperación.
4. **Pruebas del circuito completo:** alta comercial → bienvenida → equipo/QR o invitación → alumno → programa → entrenamiento → seguimiento. Guardar resultado y versión comprobada.
5. **Teléfonos reales:** instalación, apertura desde ícono, regreso tras cerrar la app, sincronización y push. La emulación de pantalla no reemplaza estas pruebas.
6. **Condiciones y políticas:** alcance, tarifa, base acordada, soporte, tratamiento de datos y documentos aplicables completos para el cliente concreto. No inventar un titular jurídico, plazos o cobertura.

Consultar el [plan de lanzamiento](../continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md) y el [último checkpoint](../continuidad/PROXIMA_SESION.md). Esta lista no marca los controles como aprobados.

## No comprometer como funcionalidad entregada

Body Intelligence experimental o diagnóstico; escaneo corporal con precisión garantizada; apps nativas publicadas; pasarela de pagos y facturación fiscal; cobro de cuotas gym→socio; calendario completo, importación CSV, PDF mensual o reservas de clases sin una verificación específica; IA clínica o decisiones automáticas de entrenamiento; integraciones con cualquier software externo que no estén implementadas y probadas.

## Registro de cambios de esta hoja

Al cerrar una capacidad: anotar fecha, versión, prueba y límite restante. Recién después actualizar la propuesta y el guion. Las cifras de rendimiento, disponibilidad o mejora comercial requieren mediciones propias; no se derivan del número de tests.
